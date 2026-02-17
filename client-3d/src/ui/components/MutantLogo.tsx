import { motion } from 'framer-motion'

/**
 * "Mutant Helix" Logo - More dramatic DNA spiral with corrosive dripping
 */
export function MutantLogo() {
  const letters = ['C', 'l', 'u', 'b', ' ', 'M', 'u', 't', 'a', 'n', 't']
  
  return (
    <div className="relative flex items-center justify-center py-2">
      <svg
        viewBox="0 0 400 120"
        className="w-80 h-auto"
        style={{ filter: 'drop-shadow(0 0 15px rgba(57, 255, 20, 0.6))' }}
      >
        <defs>
          {/* Aggressive turbulence for dripping corrosion effect */}
          <filter id="corrosion" x="-30%" y="-80%" width="160%" height="260%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.03 0.08"
              numOctaves="4"
              seed="3"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values="0.03 0.08;0.05 0.12;0.03 0.08"
                dur="2s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="12"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          
          {/* Stronger glow */}
          <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Toxic gradient */}
          <linearGradient id="toxicGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00ffff" />
            <stop offset="40%" stopColor="#39ff14" />
            <stop offset="70%" stopColor="#ff0080" />
            <stop offset="100%" stopColor="#39ff14" />
          </linearGradient>
          
          {/* Drip gradient */}
          <linearGradient id="dripGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#39ff14" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1a3d1a" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Background glow layer */}
        <text
          x="200"
          y="55"
          textAnchor="middle"
          fontSize="36"
          fontWeight="900"
          fontFamily="'JetBrains Mono', monospace"
          fill="none"
          stroke="#39ff14"
          strokeWidth="6"
          opacity="0.4"
          filter="url(#strongGlow)"
        >
          Club Mutant
        </text>
        
        {/* Main text with helix rotation and corrosion */}
        <g filter="url(#corrosion)">
          {letters.map((letter, i) => {
            // More dramatic helix - bigger spiral
            const totalLetters = letters.length
            const progress = i / (totalLetters - 1)
            
            // Helix spiral effect
            const spiralX = Math.sin(progress * Math.PI * 2) * 30
            const spiralY = Math.cos(progress * Math.PI * 2) * 15
            
            // Rotation increases along the spiral
            const rotation = (progress - 0.5) * 60 // -30 to +30 degrees
            
            // Position with spiral offset
            const baseX = 65 + i * 26 + spiralX
            const baseY = 60 + spiralY
            
            // Alternate helix sides for 3D effect
            const isFront = Math.sin(progress * Math.PI * 2) > 0
            const scale = isFront ? 1 : 0.85
            const opacity = isFront ? 1 : 0.7
            
            return (
              <motion.text
                key={i}
                x={baseX}
                y={baseY}
                textAnchor="middle"
                fontSize="32"
                fontWeight="900"
                fontFamily="'JetBrains Mono', monospace"
                fill="url(#toxicGradient)"
                style={{ 
                  transformOrigin: `${baseX}px ${baseY}px`,
                }}
                initial={{ opacity: 0, y: -30, rotate: rotation - 20 }}
                animate={{ 
                  opacity: opacity, 
                  y: spiralY,
                  rotate: rotation,
                  scale: scale,
                }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.04,
                  rotate: {
                    duration: 3,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                    delay: i * 0.15,
                  },
                  y: {
                    duration: 2.5,
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
        
        {/* Animated drip effects */}
        {[0, 2, 4, 6, 8, 10].map((i) => {
          const progress = i / 10
          const x = 65 + i * 26 + Math.sin(progress * Math.PI * 2) * 30
          return (
            <motion.g key={`drip-${i}`}>
              {/* Main drip */}
              <motion.path
                d={`M${x},75 Q${x + 3},85 ${x},95 Q${x - 3},105 ${x},115`}
                fill="none"
                stroke="url(#dripGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ 
                  pathLength: [0, 1, 0],
                  opacity: [0, 0.8, 0],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.2,
                }}
              />
              {/* Drip drop */}
              <motion.circle
                cx={x}
                cy={85}
                r="3"
                fill="#39ff14"
                initial={{ opacity: 0, y: 0 }}
                animate={{
                  opacity: [0, 0.9, 0],
                  y: [0, 35, 50],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeIn",
                  delay: i * 0.2,
                }}
              />
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}
