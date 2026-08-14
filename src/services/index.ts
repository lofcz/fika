import fetchRequest from './fetch';
import { getLL } from '@/i18n/getLL';
import message from '@/utils/message';
import { resolveFikaAsset } from '@/utils/assetBase';

const MOCK_TIMEOUT_MS = 1000 * 300;

async function getMockJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(MOCK_TIMEOUT_MS) });
    if (!response.ok) throw new Error(response.statusText || String(response.status));
    return await response.json();
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (error instanceof TypeError || timedOut || aborted) {
      message.error(getLL().common.network.connectionFailedOrTimeout());
    }
    throw error;
  }
}

export const SERVER_URL = import.meta.env.MODE === 'development' ? '/api' : 'https://server.fika.cn';
interface AIWritingPayload {
  content: string;
  command: string;
}
export default {
  getMockData(filename: string): Promise<any> {
    return getMockJson(resolveFikaAsset(`mocks/${filename}.json`));
  },
  AI_Writing({
    content,
    command
  }: AIWritingPayload): Promise<any> {
    return fetchRequest(`${SERVER_URL}/tools/ai_writing`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        command,
        model: 'glm-4.7-flash',
        stream: true
      })
    });
  }
};
