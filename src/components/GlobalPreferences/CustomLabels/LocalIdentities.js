import React, { useCallback } from 'react'
import PropTypes from 'prop-types'
import styled from 'styled-components'
import {
  Button,
  ButtonBase,
  DataView,
  DropDown,
  GU,
  IconArrowDown,
  IconArrowUp,
  IconDownload,
  IconExternal,
  IconGrid,
  IconSearch,
  IconShare,
  IconTrash,
  Info,
  TextInput,
  SearchInput,
  useTheme,
  useLayout,
  useToast,
  textStyle,
} from '@aragon/ui'
import EmptyFilteredIdentities from './EmptyFilteredIdentities'
import Import from './Import'
import LocalIdentityBadge from '../../IdentityBadge/LocalIdentityBadge'
import { ASC, DESC } from './useSort'
import { iOS } from '../../../utils'

const LocalIdentities = React.memo(function LocalIdentities({
  allSelected,
  identities,
  identitiesSelected,
  onClear,
  onExport,
  onImport,
  onRemove,
  onSearchChange,
  onSearchTerm,
  onShare,
  onShowLocalIdentityModal,
  onToggleAll,
  onToggleIdentity,
  onToggleSort,
  searchTerm,
  someSelected,
  sort,
}) {
  const { layoutName } = useLayout()
  const compact = layoutName === 'small'
  const theme = useTheme()

  return (
    <React.Fragment>
      <Info
        css={`
          margin: 0 ${compact ? `${2 * GU}px` : 0} ${2 * GU}px;
          margin-bottom: ${2 * GU}px;
        `}
      >
        Any labels you add or import will only be shown on this device, and not
        stored anywhere else. If you want to share the labels with other devices
        or users, you will need to export them and share the .json file.
      </Info>
      <DataView
        mode="table"
        heading={
          <React.Fragment>
            <Filters
              searchTerm={searchTerm}
              onSearchChange={onSearchChange}
              onSearchTerm={onSearchTerm}
              onImport={onImport}
              onShare={onShare}
              onExport={onExport}
              onRemove={onRemove}
              someSelected={someSelected}
            />
            {!identities.length && (
              <EmptyFilteredIdentities onClear={onClear} />
            )}
          </React.Fragment>
        }
        selection={identities.reduce(
          (p, { address }, index) => [
            ...p,
            ...(identitiesSelected.get(address) ? [index] : []),
          ],
          []
        )}
        onSelectEntries={
          identities.length
            ? (_, indexes) => {
                // toggle all
                if (
                  ((allSelected || !someSelected) &&
                    identities.length === indexes.length) ||
                  indexes.length === 0
                ) {
                  onToggleAll()
                  return
                }

                // toggle some (in reality only one but same process)
                identities
                  .filter(
                    ({ address }, index) =>
                      indexes.includes(index) !==
                      identitiesSelected.get(address)
                  )
                  .map(({ address }) => address)
                  .forEach(onToggleIdentity)
              }
            : undefined
        }
        fields={
          identities.length
            ? [
                <div
                  css={`
                    display: inline-flex;
                    align-items: center;
                    height: 16px;
                  `}
                >
                  <ButtonBase
                    label="Toggle sort"
                    onClick={onToggleSort}
                    css={`
                      padding: ${0.5 * GU}px ${3 * GU}px;
                      position: relative;
                      left: ${-3 * GU}px;
                      border-radius: 0;
                      display: flex;
                      align-items: center;
                      &:active {
                        background: ${theme.surfaceSelected};
                      }
                    `}
                  >
                    <span
                      css={`
                        margin-right: ${1 * GU}px;
                        ${textStyle('label2')}
                      `}
                    >
                      Custom label{' '}
                    </span>
                    {sort === ASC ? (
                      <IconArrowDown size="small" />
                    ) : (
                      <IconArrowUp size="small" />
                    )}
                  </ButtonBase>
                </div>,
                'Address',
              ]
            : []
        }
        entries={identities}
        renderEntry={({ address, name }) => [
          <span
            css={`
              width: ${compact ? `${21 * GU}px` : '100%'};
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            `}
          >
            {name}
          </span>,
          <LocalIdentityBadge entity={address} forceAddress />,
        ]}
        renderSelectionCount={count =>
          `${count} label${count > 1 ? 's' : ''} selected`
        }
      />
    </React.Fragment>
  )
})

LocalIdentities.propTypes = {
  allSelected: PropTypes.bool.isRequired,
  identities: PropTypes.array.isRequired,
  identitiesSelected: PropTypes.instanceOf(Map).isRequired,
  onClear: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onSearchTerm: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  onShowLocalIdentityModal: PropTypes.func.isRequired,
  onToggleAll: PropTypes.func.isRequired,
  onToggleIdentity: PropTypes.func.isRequired,
  onToggleSort: PropTypes.func.isRequired,
  searchTerm: PropTypes.string.isRequired,
  someSelected: PropTypes.bool.isRequired,
  sort: PropTypes.oneOf([ASC, DESC]).isRequired,
}

const Filters = React.memo(function Filters({
  onExport,
  onImport,
  onRemove,
  onSearchChange,
  onSearchTerm,
  onShare,
  searchTerm,
  someSelected,
}) {
  const { layoutName } = useLayout()
  const compact = layoutName === 'small'
  const theme = useTheme()
  const searchStyles = `
    ${textStyle('body2')};
    color: ${searchTerm.trim() ? theme.surfaceContent : theme.hint};
  `

  return (
    <div
      css={`
        display: grid;
        grid-template-columns: auto auto auto;
        grid-gap: ${1 * GU}px;
        align-items: center;
        justify-content: flex-end;
        margin-bottom: ${2 * GU}px;
      `}
    >
      <div
        css={`
          position: relative;
        `}
      >
        {compact ? (
          <TextInput
            adornment={
              <IconSearch
                css={`
                  color: ${theme.surfaceOpened};
                `}
              />
            }
            adornmentPosition="end"
            placeholder="Search"
            onChange={onSearchChange}
            value={searchTerm}
            css={`
              width: ${25 * GU}px;
              ${searchStyles};
            `}
          />
        ) : (
          <SearchInput
            onChange={onSearchTerm}
            value={searchTerm}
            placeholder="Search"
            css={`
              width: ${30 * GU}px;
              ${searchStyles};
            `}
          />
        )}
      </div>
      {!iOS && (
        <Import
          onImport={onImport}
          button={
            <Button
              css={`
                ${compact &&
                  `
                      width: ${5 * GU}px;
                      min-width: unset;
                      padding: 0;
                    `}
              `}
            >
              <IconDownload
                css={`
                  color: ${theme.surfaceOpened};
                `}
              />
              {!compact && (
                <span
                  css={`
                    display: inline-block;
                    padding-left: ${1.5 * GU}px;
                  `}
                >
                  Import
                </span>
              )}
            </Button>
          }
        />
      )}
      <Actions
        disabled={!someSelected}
        onShare={onShare}
        onExport={onExport}
        onRemove={onRemove}
      />
    </div>
  )
})

Filters.propTypes = {
  onExport: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onSearchTerm: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  searchTerm: PropTypes.string.isRequired,
  someSelected: PropTypes.bool.isRequired,
}

const Actions = React.memo(function Actions({
  onExport,
  onRemove,
  onShare,
  disabled,
}) {
  const theme = useTheme()
  const { layoutName } = useLayout()
  const compact = layoutName === 'small'
  const toast = useToast()
  const handleChange = useCallback(
    index => {
      if (index === 0) {
        onShare()
        return
      }
      if (!iOS && index === 1) {
        toast('Custom labels exported successfully')
        onExport()
        return
      }
      onRemove()
    },
    [onShare, onExport, onRemove, toast]
  )

  return (
    <React.Fragment>
      <DropDown
        css={`
          box-shadow: ${disabled ? 'none' : '0px 1px 3px rgba(0, 0, 0, 0.1)'};
          ${compact ? 'min-width: unset' : ''}
        `}
        disabled={disabled}
        compact={compact}
        selected={-1}
        items={[
          <ActionSpan
            css={`
              color: ${theme.surfaceContent};
            `}
          >
            <IconShare
              css={`
                color: ${theme.surfaceIcon};
              `}
            />
            <span>Share</span>
          </ActionSpan>,
          ...(!iOS
            ? [
                <ActionSpan>
                  <IconExternal
                    css={`
                      color: ${theme.surfaceIcon};
                    `}
                  />
                  <span>Export</span>
                </ActionSpan>,
              ]
            : []),
          <ActionSpan>
            <IconTrash
              css={`
                color: ${theme.red};
              `}
            />
            <span>Remove</span>
          </ActionSpan>,
        ]}
        placeholder={
          <span
            css={`
              height: 24px;
              $textStyle('body2');
              color: ${
                disabled ? theme.contentSecondary : theme.surfaceContent
              };

              ${
                !compact
                  ? `
                  display: grid;
                  grid-template-columns: auto 1fr auto;
                  grid-gap: ${1.5 * GU}px;
                  width: 100%;
                  align-items: center;
                `
                  : ''
              }
            `}
          >
            <IconGrid
              css={`
                color: ${theme.surfaceIcon};
              `}
            />
            {!compact && <span css="text-align: left;">Actions</span>}
          </span>
        }
        onChange={handleChange}
      />
    </React.Fragment>
  )
})

Actions.propTypes = {
  onExport: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  disabled: PropTypes.bool.isRequired,
}

const ActionSpan = styled.span`
  display: grid;
  align-items: center;
  grid-template-columns: auto 1fr;
  grid-gap: ${1 * GU}px;
  ${textStyle('body2')};

  & span {
    text-align: left;
  }
`

export default React.memo(LocalIdentities)
