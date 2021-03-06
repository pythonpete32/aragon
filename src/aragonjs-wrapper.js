import BN from 'bn.js'
import resolvePathname from 'resolve-pathname'
import Aragon, {
  apm,
  ensResolve,
  getRecommendedGasLimit,
  providers,
} from '@aragon/wrapper'
import {
  appOverrides,
  sortAppsPair,
  ipfsDefaultConf,
  web3Providers,
  contractAddresses,
  defaultGasPriceFn,
} from './environment'
import { NoConnection, DAONotFound } from './errors'
import { getEthSubscriptionEventDelay } from './local-settings'
import { workerFrameSandboxDisabled } from './security/configuration'
import { appBaseUrl } from './url-utils'
import { noop, removeStartingSlash } from './utils'
import {
  getWeb3,
  getUnknownBalance,
  getMainAccount,
  isEmptyAddress,
  isValidEnsName,
} from './web3-utils'
import SandboxedWorker from './worker/SandboxedWorker'
import WorkerSubscriptionPool from './worker/WorkerSubscriptionPool'

const POLL_DELAY_ACCOUNT = 2000
const POLL_DELAY_NETWORK = 2000
const POLL_DELAY_CONNECTIVITY = 2000

const applyAppOverrides = apps =>
  apps.map(app => ({ ...app, ...(appOverrides[app.appId] || {}) }))

// Sort apps, apply URL overrides, and attach data useful to the frontend
const prepareAppsForFrontend = (apps, daoAddress, gateway) => {
  const hasWebApp = app => Boolean(app['start_url'])

  const getAPMRegistry = ({ appName = '' }) =>
    appName.substr(appName.indexOf('.') + 1) // everything after the first '.'

  const getAppTags = app => {
    const apmRegistry = getAPMRegistry(app)

    const tags = []
    if (app.status) {
      tags.push(app.status)
    }
    if (apmRegistry && apmRegistry !== 'aragonpm.eth') {
      tags.push(`${apmRegistry} registry`)
    }
    if (!hasWebApp(app)) {
      tags.push('contract-only')
    }

    return tags
  }

  return applyAppOverrides(apps)
    .map(app => {
      const baseUrl = appBaseUrl(app, gateway)
      // Remove the starting slash from the start_url field
      // so the absolute path can be resolved from baseUrl.
      const startUrl = removeStartingSlash(app['start_url'] || '')
      const src = baseUrl ? resolvePathname(startUrl, baseUrl) : ''

      return {
        ...app,
        src,
        baseUrl,
        apmRegistry: getAPMRegistry(app),
        hasWebApp: hasWebApp(app),
        tags: getAppTags(app),
      }
    })
    .sort(sortAppsPair)
}

// TODO: move polling and ens related utilities to web3-utils
const pollEvery = (fn, delay) => {
  let timer = -1
  let stop = false
  const poll = async (request, onResult) => {
    const result = await request()
    if (!stop) {
      onResult(result)
      timer = setTimeout(poll.bind(null, request, onResult), delay)
    }
  }
  return (...params) => {
    const { request, onResult } = fn(...params)
    poll(request, onResult)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }
}

// Filter the value we get from getBalance() before passing it to BN.js.
// This is because passing some values to BN.js can lead to an infinite loop
// when .toString() is called. Returns "-1" when the value is invalid.
//
// See https://github.com/indutny/bn.js/issues/186
const filterBalanceValue = value => {
  if (value === null) {
    return '-1'
  }
  if (typeof value === 'object') {
    value = String(value)
  }
  if (typeof value === 'string') {
    return /^[0-9]+$/.test(value) ? value : '-1'
  }
  return '-1'
}

// Keep polling the main account.
// See https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md#ear-listening-for-selected-account-changes
export const pollMainAccount = pollEvery(
  (provider, { onAccount = () => {}, onBalance = () => {} } = {}) => {
    const web3 = getWeb3(provider)
    let lastAccount = null
    let lastBalance = getUnknownBalance()

    return {
      request: () =>
        getMainAccount(web3)
          .then(account => {
            if (!account) {
              throw new Error('no account')
            }
            return web3.eth
              .getBalance(account)
              .then(filterBalanceValue)
              .then(balance => ({ account, balance: new BN(balance) }))
          })
          .catch(() => ({ account: null, balance: getUnknownBalance() })),
      onResult: ({ account, balance }) => {
        if (account !== lastAccount) {
          lastAccount = account
          onAccount(account)
        }
        if (!balance.eq(lastBalance)) {
          lastBalance = balance
          onBalance(balance)
        }
      },
    }
  },
  POLL_DELAY_ACCOUNT
)

export const pollConnectivity = pollEvery((providers = [], onConnectivity) => {
  let lastFound = null
  return {
    request: async () => {
      try {
        await Promise.all(
          providers.map(p => getWeb3(p).eth.net.getNetworkType())
        )
        return true
      } catch (err) {
        return false
      }
    },
    onResult: connected => {
      if (connected !== lastFound) {
        lastFound = connected
        onConnectivity(connected)
      }
    },
  }
  // web.eth.net.isListening()
}, POLL_DELAY_CONNECTIVITY)

// Keep polling the network.
export const pollNetwork = pollEvery((provider, onNetwork) => {
  const web3 = getWeb3(provider)
  let lastFound = null
  return {
    request: () => web3.eth.net.getNetworkType(),
    onResult: network => {
      if (network !== lastFound) {
        lastFound = network
        onNetwork(network)
      }
    },
  }
}, POLL_DELAY_NETWORK)

export const resolveEnsDomain = async domain => {
  try {
    return await ensResolve(domain, {
      provider: web3Providers.default,
      registryAddress: contractAddresses.ensRegistry,
    })
  } catch (err) {
    if (err.message === 'ENS name not defined.') {
      return ''
    }
    throw err
  }
}

export const isEnsDomainAvailable = async name => {
  const addr = await resolveEnsDomain(name)
  return addr === '' || isEmptyAddress(addr)
}

export const fetchApmArtifact = async (
  repoAddress,
  ipfsConf = ipfsDefaultConf
) => {
  return apm(getWeb3(web3Providers.default), {
    ipfsGateway: ipfsConf.gateway,
  }).fetchLatestRepoContent(repoAddress)
}

// Subscribe to aragon.js observables
const subscribe = (
  wrapper,
  {
    onApps,
    onPermissions,
    onForwarders,
    onAppIdentifiers,
    onInstalledRepos,
    onIdentityIntent,
    onSignatures,
    onTransaction,
  },
  { ipfsConf }
) => {
  const {
    apps,
    permissions,
    forwarders,
    appIdentifiers,
    installedRepos,
    identityIntents,
    signatures,
    transactions,
  } = wrapper

  const workerSubscriptionPool = new WorkerSubscriptionPool()

  const subscriptions = {
    permissions: permissions.subscribe(onPermissions),
    forwarders: forwarders.subscribe(onForwarders),
    appIdentifiers: appIdentifiers.subscribe(onAppIdentifiers),
    installedRepos: installedRepos.subscribe(onInstalledRepos),
    identityIntents: identityIntents.subscribe(onIdentityIntent),
    transactions: transactions.subscribe(onTransaction),
    signatures: signatures.subscribe(onSignatures),
    connectedApp: null,
    connectedWorkers: workerSubscriptionPool,

    apps: apps.subscribe(apps => {
      onApps(
        prepareAppsForFrontend(
          apps,
          wrapper.kernelProxy.address,
          ipfsConf.gateway
        )
      )
    }),
    workers: apps.subscribe(apps => {
      // Asynchronously launch webworkers for each new or updated app that has
      // a background script defined
      applyAppOverrides(apps)
        .filter(app => app.script)
        .filter(
          ({ proxyAddress, updated }) =>
            updated || !workerSubscriptionPool.hasWorker(proxyAddress)
        )
        .forEach(async app => {
          const { name, proxyAddress, script, updated } = app
          const workerName = `${name}(${proxyAddress})`
          const baseUrl = appBaseUrl(app, ipfsConf.gateway)

          // If the app URL is empty, the script can’t be retrieved
          if (!baseUrl) {
            return
          }

          // Remove the starting slash from the script field to force it to
          // load relative to the app's base url
          const scriptUrl = resolvePathname(
            removeStartingSlash(script),
            baseUrl
          )

          const connectApp = await wrapper.runApp(proxyAddress)

          // If the app has been updated, reset its cache and restart its worker
          if (updated && workerSubscriptionPool.hasWorker(proxyAddress)) {
            await workerSubscriptionPool.removeWorker(proxyAddress, {
              clearCache: true,
            })
          }

          // If another execution context already loaded this app's worker
          // before we got to it here, let's short circuit
          if (!workerSubscriptionPool.hasWorker(proxyAddress)) {
            const worker = new SandboxedWorker(scriptUrl, { name: workerName })

            const provider = new providers.MessagePortMessage(worker)
            workerSubscriptionPool.addWorker({
              app,
              worker,
              connection: connectApp(provider),
            })
          }
        })
    }),
  }

  return subscriptions
}

const initWrapper = async (
  dao,
  {
    provider,
    walletProvider = null,
    ipfsConf = ipfsDefaultConf,
    onApps = noop,
    onPermissions = noop,
    onForwarders = noop,
    onAppIdentifiers = noop,
    onInstalledRepos = noop,
    onIdentityIntent = noop,
    onTransaction = noop,
    onSignatures = noop,
    onDaoAddress = noop,
    onWeb3 = noop,
  } = {}
) => {
  const isDomain = isValidEnsName(dao)
  const daoAddress = isDomain ? await resolveEnsDomain(dao) : dao

  if (!daoAddress) {
    throw new DAONotFound(dao)
  }

  onDaoAddress({ address: daoAddress, domain: dao })

  const wrapper = new Aragon(daoAddress, {
    provider,
    defaultGasPriceFn,
    apm: {
      ensRegistryAddress: contractAddresses.ensRegistry,
      ipfs: ipfsConf,
    },
    cache: {
      // If the worker's origin sandbox is disabed, it has full access to IndexedDB.
      // We force a downgrade to localStorage to avoid using IndexedDB.
      forceLocalStorage: workerFrameSandboxDisabled,
    },
    events: {
      // Infura hack: delay event processing for specified number of ms
      subscriptionEventDelay: getEthSubscriptionEventDelay(),
    },
  })

  const web3 = getWeb3(walletProvider || provider)
  onWeb3(web3)

  const account = await getMainAccount(web3)
  try {
    await wrapper.init({
      accounts: {
        providedAccounts: account ? [account] : [],
      },
    })
  } catch (err) {
    if (err.message === 'Provided daoAddress is not a DAO') {
      throw new DAONotFound(dao)
    }
    if (err.message === 'connection not open') {
      throw new NoConnection('No Ethereum connection detected')
    }

    throw err
  }

  const subscriptions = subscribe(
    wrapper,
    {
      onApps,
      onPermissions,
      onForwarders,
      onAppIdentifiers,
      onInstalledRepos,
      onIdentityIntent,
      onSignatures,
      onTransaction,
    },
    { ipfsConf }
  )

  wrapper.connectAppIFrame = async (iframeElt, proxyAddress) => {
    const provider = new providers.WindowMessage(iframeElt.contentWindow)
    const appContext = (await wrapper.runApp(proxyAddress))(provider)

    if (subscriptions.connectedApp) {
      subscriptions.connectedApp.unsubscribe()
    }
    subscriptions.connectedApp = {
      unsubscribe: appContext.shutdown,
    }
    return appContext
  }

  wrapper.cancel = () => {
    Object.values(subscriptions).forEach(subscription => {
      if (subscription) {
        subscription.unsubscribe()
      }
    })
  }

  return wrapper
}

export { getRecommendedGasLimit }
export default initWrapper
