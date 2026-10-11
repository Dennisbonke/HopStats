export async function checkBackend(): Promise<boolean> {
  const response = await fetch("/api/v1/health");
  return response.ok;
}
