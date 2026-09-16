/** Typed client for talking to the service worker. Used by every UI surface and content script. */
import type { Api, ApiResponse, ApiType } from '../types/messages';

export class ApiError extends Error {}

export async function call<T extends ApiType>(type: T, req: Api[T]['req']): Promise<Api[T]['res']> {
  const res = (await chrome.runtime.sendMessage({ type, ...req })) as ApiResponse<T> | undefined;
  if (!res) throw new ApiError('Impulse Vault is restarting. Try again in a second.');
  if (!res.ok) throw new ApiError(res.error);
  return res.data;
}
