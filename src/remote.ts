export class Remote {
  // Public static methods

  public static async push(
    configured: string | null,
    urlOverride: string | null,
    data: Record<string, unknown>,
  ): Promise<void> {
    const targetUrl = Remote.resolveUrl(configured, urlOverride);
    const response = await fetch(targetUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (response.ok === false) {
      throw new Error(
        `[Aspen] Push to "${targetUrl}" failed: HTTP ${response.status}`,
      );
    }
  }

  public static async pull(
    configured: string | null,
    urlOverride: string | null,
  ): Promise<Record<string, unknown> | null> {
    const targetUrl = Remote.resolveUrl(configured, urlOverride);
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
      return null;
    }
    if (response.ok === false) {
      throw new Error(
        `[Aspen] Pull from "${targetUrl}" failed: HTTP ${response.status}`,
      );
    }

    const data = (await response.json()) as unknown;
    const malformedError = new Error(
      `[Aspen] Pull from "${targetUrl}" returned malformed state`,
    );
    if (typeof data !== "object") throw malformedError;
    if (data === null) throw malformedError;
    if (Array.isArray(data) === true) throw malformedError;

    return data as Record<string, unknown>;
  }

  // Private static methods

  private static resolveUrl(
    configured: string | null,
    urlOverride: string | null,
  ): string {
    let targetUrl: string | null = configured;
    if (urlOverride !== null) {
      targetUrl = urlOverride;
    }
    if (targetUrl === null) {
      throw new Error(
        "[Aspen] No persistence URL configured. Set persistenceUrl or pass one as an argument.",
      );
    }
    return targetUrl;
  }
}
