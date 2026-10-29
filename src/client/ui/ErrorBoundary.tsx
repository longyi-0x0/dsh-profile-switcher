import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Keeps one crashing slot entry from blanking the Host slot.
 *
 * The slot system treats a thrown component as a failed entry; rendering nothing and
 * logging the error lets the rest of the sidebar keep working.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  /**
   * @param _error - the thrown error.
   * @returns the failed state.
   */
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  /**
   * @param error - the thrown error.
   * @param info - React component stack.
   */
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[profile-switcher] slot entry crashed', error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
