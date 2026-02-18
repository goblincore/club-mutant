import { motion } from 'framer-motion'

/**
 * "Club Mutant" Logo - Image-based logo centered in the carousel ring
 */
export function MutantLogo() {
  return (
    <motion.div
      className="flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <img
        src="/logo/ver1.png"
        alt="Club Mutant"
        className="pointer-events-none select-none"
        style={{
          width: 200,
          height: 'auto',
          filter: 'drop-shadow(0 0 20px rgba(57, 255, 20, 0.4))',
        }}
        draggable={false}
      />
    </motion.div>
  )
}
