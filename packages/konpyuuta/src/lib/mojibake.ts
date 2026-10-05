// Visual encoding noise, never a transformation of stored user content.
const GLYPHS = [...'ÉäÅÇÃ∑◊ƒÂÆøì¥ñÖÐﾘｼｭｳｱｲｴｵﾂﾝｺﾐｬｿ']

export function corruptSignal(text: string, progress: number, frame: number): string {
  const characters = [...text]
  const resolved = Math.floor(Math.max(0, Math.min(1, progress)) * characters.length)
  return characters.map((character, index) => {
    if (/\s/u.test(character) || index < resolved) return character
    return GLYPHS[(index * 7 + frame * 3 + character.codePointAt(0)!) % GLYPHS.length]
  }).join('')
}
