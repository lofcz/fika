import { decodeHtmlEntities, unescapeAgentNewlines } from './agentText';

/**
 * Convert plain text to HTML string with paragraph information
 * @param text Text
 */
export const parseText2Paragraphs = (text: string) => {
  const htmlText = unescapeAgentNewlines(decodeHtmlEntities(text)).replace(/\r\n|\r|\n/g, '<br>');
  const paragraphs = htmlText.split('<br>');
  let string = '';
  for (const paragraph of paragraphs) {
    if (paragraph) string += `<div>${paragraph}</div>`;
  }
  return string;
};
