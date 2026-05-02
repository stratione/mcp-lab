import '@testing-library/jest-dom/vitest'

// Radix UI primitives (Popover, Slider) use ResizeObserver which jsdom doesn't provide.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
