export type TilePoint = {
  x: number

  y: number
}

type HeapNode = {
  idx: number

  f: number
}

class MinHeap {
  private heap: HeapNode[] = []

  push(node: HeapNode) {
    this.heap.push(node)
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): HeapNode | null {
    if (this.heap.length === 0) return null

    const top = this.heap[0]
    const last = this.heap.pop()

    if (this.heap.length > 0 && last) {
      this.heap[0] = last
      this.bubbleDown(0)
    }

    return top
  }

  get size() {
    return this.heap.length
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = (index - 1) >> 1

      if (this.heap[parent].f <= this.heap[index].f) return

      const temp = this.heap[parent]
      this.heap[parent] = this.heap[index]
      this.heap[index] = temp

      index = parent
    }
  }

  private bubbleDown(index: number) {
    const length = this.heap.length

    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index

      if (left < length && this.heap[left].f < this.heap[smallest].f) {
        smallest = left
      }

      if (right < length && this.heap[right].f < this.heap[smallest].f) {
        smallest = right
      }

      if (smallest === index) return

      const temp = this.heap[smallest]
      this.heap[smallest] = this.heap[index]
      this.heap[index] = temp

      index = smallest
    }
  }
}

const manhattan = (ax: number, ay: number, bx: number, by: number) => {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

export const findPathAStar = (params: {
  width: number

  height: number

  blocked: Uint8Array

  start: TilePoint

  goal: TilePoint
}): TilePoint[] | null => {
  const { width, height, blocked, start, goal } = params

  const inBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height

  const toIdx = (x: number, y: number) => y * width + x

  const startIdx = toIdx(start.x, start.y)
  const goalIdx = toIdx(goal.x, goal.y)

  if (!inBounds(start.x, start.y) || !inBounds(goal.x, goal.y)) return null
  if (blocked[startIdx] === 1 || blocked[goalIdx] === 1) return null

  const cameFrom = new Int32Array(width * height)
  cameFrom.fill(-1)

  const gScore = new Float64Array(width * height)
  gScore.fill(Number.POSITIVE_INFINITY)
  gScore[startIdx] = 0

  const heap = new MinHeap()
  heap.push({
    idx: startIdx,
    f: manhattan(start.x, start.y, goal.x, goal.y),
  })

  while (heap.size > 0) {
    const current = heap.pop()
    if (!current) break

    const currentIdx = current.idx

    if (currentIdx === goalIdx) {
      const path: TilePoint[] = []

      let idx = goalIdx
      while (idx !== -1) {
        const x = idx % width
        const y = Math.floor(idx / width)
        path.push({ x, y })

        idx = cameFrom[idx]
      }

      path.reverse()
      return path
    }

    const currentX = currentIdx % width
    const currentY = Math.floor(currentIdx / width)
    const currentG = gScore[currentIdx]

    const neighbors: Array<{ x: number; y: number }> = [
      { x: currentX + 1, y: currentY },
      { x: currentX - 1, y: currentY },
      { x: currentX, y: currentY + 1 },
      { x: currentX, y: currentY - 1 },
    ]

    for (const n of neighbors) {
      if (!inBounds(n.x, n.y)) continue

      const nIdx = toIdx(n.x, n.y)
      if (blocked[nIdx] === 1) continue

      const tentativeG = currentG + 1
      if (tentativeG >= gScore[nIdx]) continue

      cameFrom[nIdx] = currentIdx
      gScore[nIdx] = tentativeG

      const f = tentativeG + manhattan(n.x, n.y, goal.x, goal.y)
      heap.push({ idx: nIdx, f })
    }
  }

  return null
}
