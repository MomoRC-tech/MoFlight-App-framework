/** Hub children, not persistent tabs. Statistics/Costs reuse their retained page host. */
export const pilotTitles = {home:'Start', flights:'Flüge', logbook:'Papierflugbuch', club:'Verein', ai:'Assistent'} as const;
export type PilotTab = keyof typeof pilotTitles;
