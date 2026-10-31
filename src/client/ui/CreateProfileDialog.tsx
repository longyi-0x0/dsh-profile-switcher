import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PROFILE_NAME_PATTERN, type HomeSummary } from '../../shared/protocol'
import { errorMessage } from '../i18n'
import { useRuntime, useTranslate } from '../runtime'
import { useStoreValue } from '../store'

/** Centered create-profile dialog rendered in `shell.overlay`. */
export function CreateProfileDialog() {
  const { store, controller, translate } = useRuntime()
  const message = useTranslate()
  const open = useStoreValue(store, (state) => state.createOpen)
  const homes = useStoreValue(store, (state) => state.homes)
  const mutation = useStoreValue(store, (state) => state.mutation)
  const cardRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft('')
    inputRef.current?.focus()
  }, [open])

  // A press anywhere outside the card cancels the dialog.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (cardRef.current?.contains(target) === true) return
      controller.closeCreate()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, controller])

  // Escape cancels; Tab stays inside the modal instead of leaving it.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        controller.closeCreate()
        return
      }
      if (event.key !== 'Tab') return
      const card = cardRef.current
      if (card === null) return
      const items = [
        ...card.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'),
      ]
      if (items.length === 0) return
      event.preventDefault()
      const index = items.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey
        ? index <= 0
          ? items.length - 1
          : index - 1
        : index < 0 || index === items.length - 1
          ? 0
          : index + 1
      items[next]?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, controller])

  if (!open) return null

  // New profiles go into the home this Host serves, falling back to the first listing.
  const home: HomeSummary | null =
    homes === null ? null : (homes.find((candidate) => candidate.current) ?? homes[0] ?? null)
  if (home === null) return null

  const name = draft.trim()
  const valid = PROFILE_NAME_PATTERN.test(name)
  const busy = mutation?.kind === 'create' && mutation.busy
  const error = mutation?.kind === 'create' ? mutation.error : null

  const close = (): void => {
    controller.closeCreate()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!valid || busy) return
    void controller.createProfile(home.path, name)
  }

  return (
    <div className="dps-scrim">
      <form
        ref={cardRef}
        className="dps-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dps-create-title"
        onSubmit={onSubmit}
      >
        <div className="dps-dialogTitle" id="dps-create-title">
          {message('menu.newTitle', { home: home.label })}
        </div>
        <div className="dps-dialogBody">
          <input
            ref={inputRef}
            className="dps-input"
            value={draft}
            aria-label={message('menu.newName')}
            placeholder={message('menu.newPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="dps-fieldHint">{message('menu.nameHint')}</div>
          {error === null ? null : (
            <div className="dps-dialogError">
              {errorMessage(translate, error.code)}
              {error.detail === undefined ? '' : ` — ${error.detail}`}
            </div>
          )}
        </div>
        <div className="dps-dialogActions">
          <button type="button" className="dps-ghost" onClick={close}>
            {message('menu.cancel')}
          </button>
          <button type="submit" className="dps-primary" disabled={!valid || busy}>
            {busy ? message('menu.creating') : message('menu.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
