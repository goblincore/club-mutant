import { motion } from 'framer-motion'

/**
 * "Club Mutant" Logo - Simple red text, easy to read
 */
export function MutantLogo() {
  return (
    <div className="relative flex items-center justify-center py-2">
      <motion.h1
        className="text-4xl font-black font-mono tracking-wider"
        style={{
          color: '#ff0040',
          textShadow: `
            0 0 20px rgba(255, 0, 64, 0.8),
            0 0 40px rgba(255, 0, 64, 0.4),
            0 0 60px rgba(255, 0, 64, 0.2)
          `,
        }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        Club Mutant
      </motion.h1>
    </div>
  )
}
