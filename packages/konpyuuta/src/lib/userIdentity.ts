/** Personalize bundled desktop text without treating usernames as syntax. */
export function personalizeUsername(text: string, username: string): string {
  return text.split('{{username}}').join(username)
}

export function personalizeUserJson(data: unknown, username: string): string {
  return JSON.stringify(data, (_key, value: unknown) =>
    typeof value === 'string' ? personalizeUsername(value, username) : value,
  2)
}
