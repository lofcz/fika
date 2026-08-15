import RBush from 'rbush'

export type HitBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  id: string
  zIndex: number
}

const sameHit = (a: HitBox, b: HitBox) => a === b || a.id === b.id

/** Dynamic RBush of visual hit rects. load() replaces the current set. */
export class HitIndex {
  private tree = new RBush<HitBox>()

  clear(): void {
    this.tree.clear()
  }

  load(items: HitBox[]): void {
    this.tree.clear()
    if (items.length) this.tree.load(items)
  }

  insert(item: HitBox): void {
    this.tree.insert(item)
  }

  remove(item: HitBox): void {
    this.tree.remove(item, sameHit)
  }

  search(minX: number, minY: number, maxX: number, maxY: number): HitBox[] {
    return this.tree.search({ minX, minY, maxX, maxY })
  }

  hitPoint(x: number, y: number): HitBox | null {
    const hits = this.search(x, y, x, y)
    let best: HitBox | null = null
    for (const hit of hits) {
      if (!best || hit.zIndex >= best.zIndex) best = hit
    }
    return best
  }
}
