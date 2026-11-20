/**
 * jsdom gaps that Radix/cmdk touch. Loaded for every test file; does nothing in the Node
 * environment (Main tests).
 */
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe(): void {
        // jsdom has no layout: nothing to observe.
      }
      unobserve(): void {
        // jsdom has no layout: nothing to observe.
      }
      disconnect(): void {
        // jsdom has no layout: nothing to observe.
      }
    }
    Object.assign(window, { ResizeObserver: ResizeObserverStub })
    Object.assign(globalThis, { ResizeObserver: ResizeObserverStub })
  }
  Element.prototype.scrollIntoView ??= function scrollIntoView(): void {
    // jsdom has no layout: nothing to observe.
  }
  Element.prototype.hasPointerCapture ??= (): boolean => false
  Element.prototype.releasePointerCapture ??= (): void => undefined
}

// Screens keep their state across unmounts (`usePageState`): every test starts clean.
import { afterEach } from 'vitest'
import { resetPageState } from '@renderer/lib/page-state'
afterEach(() => resetPageState())
