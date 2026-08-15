/** Authored painter order. Index 0 is the back; the last id is the front. */
export const elementStackIds = (elements: readonly { id: string }[]) => {
  const ids = new Array<string>(elements.length)
  for (let i = 0; i < elements.length; i++) ids[i] = elements[i].id
  return ids
}
