/**
 * Progressive enhancement for `Carousel.astro`: the scroll-snap strip already works without JS.
 * Adds previous/next, dots, arrow/Home/End keys and tracks the active slide with IntersectionObserver.
 * No autoplay. Smooth scrolling only when the user has not asked for reduced motion.
 */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

function setup(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-carousel-track]')
  const controls = root.querySelector<HTMLElement>('[data-carousel-controls]')
  const prev = root.querySelector<HTMLButtonElement>('[data-carousel-prev]')
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]')
  const slides = [...root.querySelectorAll<HTMLElement>('[data-carousel-slide]')]
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-carousel-dot]')]
  if (!track || !controls || !prev || !next || slides.length < 2) return
  let active = 0

  const render = (): void => {
    dots.forEach((dot, i) => (i === active ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current')))
    prev.disabled = active === 0
    next.disabled = active === slides.length - 1
  }
  const goTo = (index: number): void => {
    const target = slides[Math.max(0, Math.min(slides.length - 1, index))]
    track.scrollTo({ left: target.offsetLeft, behavior: reducedMotion.matches ? 'instant' : 'smooth' })
  }

  prev.addEventListener('click', () => goTo(active - 1))
  next.addEventListener('click', () => goTo(active + 1))
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)))
  root.addEventListener('keydown', (event) => {
    const moves: Record<string, number> = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: slides.length - 1 }
    if (!(event.key in moves) || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    goTo(moves[event.key])
  })

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) active = slides.indexOf(entry.target as HTMLElement)
      render()
    },
    { root: track, threshold: 0.6 }
  )
  slides.forEach((slide) => observer.observe(slide))
  controls.hidden = false
  render()
}

export function initCarousels(): void {
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach(setup)
}
