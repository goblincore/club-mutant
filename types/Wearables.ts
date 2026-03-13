export type BoneRole = 'head' | 'torso' | 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r'

export interface WearableSlot {
  itemId: string // e.g. "party-hat"
  attachBone: BoneRole // which bone to attach to (e.g. "head" for hats)
  offsetX: number // bone-local offset X (small values, ~±0.5 in PX_SCALE space)
  offsetY: number // bone-local offset Y
  scale: number // 0.1 to 2.0
  zIndex: number // render order: positive = in front, negative = behind character
}

export interface WearableConfig {
  slots: WearableSlot[] // max 3 slots
}
