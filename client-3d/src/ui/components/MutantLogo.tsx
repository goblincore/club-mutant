/**
 * "Club Mutant" Logo - Image-based logo centered in the carousel ring
 */
export function MutantLogo() {
  return (
    <div className="flex items-center justify-center logo-fadein">
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
      <style>{`
        @keyframes logo-fadein {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        .logo-fadein {
          animation: logo-fadein 0.6s ease-out both;
        }
      `}</style>
    </div>
  )
}
