export const easeExpo = [0.16, 1, 0.3, 1]

export const fadeUp = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: easeExpo } },
}

export const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
}

export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: easeExpo } },
}

export const slideInRight = {
  hidden:  { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: easeExpo } },
}

export const toastVariant = {
  hidden:  { opacity: 0, y: 16, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: easeExpo } },
  exit:    { opacity: 0, y: 8, scale: 0.95, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
}

export const overlayBg = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
}
