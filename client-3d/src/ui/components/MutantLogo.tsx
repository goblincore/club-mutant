import { motion } from 'framer-motion'

/**
 * "Mutant Helix" Logo - DNA spiral with corrosive dripping effect
 * Each letter rotates along a helix with organic drip animation
 */
export function MutantLogo() {
  const letters = ['C', 'l', 'u', 'b', ' ', 'M', 'u', 't', 'a', 'n', 't']
  
  return (
    <div className="relative flex items-center justify-center py-4">
      <svg
        viewBox="0 0 320 80"
        className="w-72 h-auto"
        style={{ filter: 'drop-shadow(0 0 8px rgba(57, 255, 20, 0.5))' }}
      >
        <defs>
          {/* Turbulence filter for corrosion/dripping effect */}
          <filter id="corrosion" x="-20%" y="-50%" width="140%" height="200%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05 0.02"
              numOctaves="3"
              seed="5"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values="0.05 0.02;0.06 0.025;0.05 0.02"
                dur="3s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          
          {/* Glow filter */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Gradient for toxic effect */}
          <linearGradient id="toxicGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00ffff" />
            <stop offset="50%" stopColor="#39ff14" />
            <stop offset="100%" stopColor="#ff0080" />
          </linearGradient>
        </defs>
        
        {/* Background glow */}
        <text
          x="160"
          y="45"
          textAnchor="middle"
          fontSize="32"
          fontWeight="900"
          fontFamily="'JetBrains Mono', monospace"
          fill="none"
          stroke="#39ff14"
          strokeWidth="4"
          opacity="0.3"
          filter="url(#glow)"
        >
          Club Mutant
        </text>
        
        {/* Main text with helix rotation */}
        <g filter="url(#corrosion)">
          {letters.map((letter, i) => {
            // DNA helix math: alternating sides, spiral rotation
            const isLeft = i % 2 === 0
            const helixOffset = isLeft ? -12 : 12
            const rotation = (i - 5) * 12 // Spiral effect
            const yOffset = Math.sin((i / letters.length) * Math.PI * 2) * 8
            const xPosition = 55 + i * 20
            
            return (
              <motion.text
                key={i}
                x={xPosition}
                y={45 + yOffset + helixOffset}
                textAnchor="middle"
                fontSize="28"
                fontWeight="900"
                fontFamily="'JetBrains Mono', monospace"
                fill="url(#toxicGradient)"
                style={{ 
                  transformOrigin: `${xPosition}px ${45 + yOffset}px`,
                }}
                initial={{ opacity: 0, y: -20 }}
                animate={{ 
                  opacity: 1, 
                  y: yOffset + helixOffset,
                  rotate: rotation,
                }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.05,
                  rotate: {
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                    delay: i * 0.1,
                  }
                }}
              >
                {letter === ' ' ? '\u00A0' : letter}
              </motion.text>
            )
          })}
        </g>
        
        {/* Drip particles */}
        {[0, 3, 6, 9].map((i) => (
          <motion.circle
            key={`drip-${i}`}
            cx={55 + i * 20}
            cy={55}
            r="2"
            fill="#39ff14"
            opacity="0.6"
            animate={{
              y: [0, 15, 0],
              opacity: [0.6, 0.2, 0.6],
            }}
            transition={{
              duration: 2 + Math.random(),
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          />
        ))}
      </svg>
    </div>
  )
}
