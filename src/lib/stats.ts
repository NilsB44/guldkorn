// Small gamification bits: milestones and cheerful copy.

export const MILESTONES = [1, 10, 25, 50, 100, 200, 365, 500, 1000]

/** Milestone crossed when the total went from `before` to `after`, if any. */
export function crossedMilestone(before: number, after: number): number | undefined {
  return [...MILESTONES].reverse().find((m) => before < m && after >= m)
}

export function milestoneText(m: number): string {
  if (m === 1) return 'Ditt allra första guldkorn! 🌟'
  return `${m} guldkorn totalt — vilken samling! 🏆`
}

const CHEERS = ['Snyggt valt!', 'Vilka minnen!', 'Så fint!', 'Guld värt!', 'Härligt!', 'Precis rätt!']

export function cheer(seed: number): string {
  return CHEERS[Math.abs(seed) % CHEERS.length]
}
