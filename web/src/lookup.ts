/** A web search for a person at a company, opened by the reader's own tap. Built only from those two names, and FINN checks nothing it returns. */
export const backgroundSearch = (person: string, company: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${person} ${company}`)}`
