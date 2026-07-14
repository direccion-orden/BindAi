export interface AmazonClientConfig {
  sellerId?: string;
  marketplaceId?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: "na" | "eu" | "fe";
}

const REGION_URLS = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
};

export class AmazonSPClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private region: "na" | "eu" | "fe";
  private accessToken?: string;
  private tokenExpiresAt?: number;

  constructor(config: AmazonClientConfig) {
    this.clientId = config.clientId.trim();
    this.clientSecret = config.clientSecret.trim();
    this.refreshToken = config.refreshToken.trim();
    this.region = config.region;
  }

  private getBaseUrl(): string {
    return REGION_URLS[this.region] || REGION_URLS.na;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Reusar token si sigue vigente (con margen de 5 minutos)
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt - now > 5 * 60 * 1000) {
      return this.accessToken;
    }

    try {
      const response = await fetch("https://api.amazon.com/auth/o2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to refresh Amazon LWA token: ${errText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return this.accessToken!;
    } catch (error: any) {
      console.error("Error fetching Amazon SP-API access token:", error);
      throw error;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const token = await this.getAccessToken();
    const headers = {
      "Content-Type": "application/json",
      "x-amz-access-token": token,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Amazon SP-API Error (${response.status}): ${errorText || response.statusText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // --- Orders ---
  async getOrders(params: {
    MarketplaceIds: string[];
    CreatedAfter?: string;
    LastUpdatedAfter?: string;
    MaxResultsPerPage?: number;
    NextToken?: string;
  }): Promise<{ Orders: any[]; NextToken?: string }> {
    const searchParams = new URLSearchParams();
    params.MarketplaceIds.forEach(id => searchParams.append("MarketplaceIds", id));
    
    if (params.CreatedAfter) searchParams.append("CreatedAfter", params.CreatedAfter);
    if (params.LastUpdatedAfter) searchParams.append("LastUpdatedAfter", params.LastUpdatedAfter);
    if (params.MaxResultsPerPage) searchParams.append("MaxResultsPerPage", params.MaxResultsPerPage.toString());
    if (params.NextToken) searchParams.append("NextToken", params.NextToken);

    return this.request<{ Orders: any[]; NextToken?: string }>(
      `/orders/v0/orders?${searchParams.toString()}`
    );
  }

  // --- Order Items ---
  async getOrderItems(orderId: string, nextToken?: string): Promise<{ OrderItems: any[]; NextToken?: string }> {
    let endpoint = `/orders/v0/orders/${orderId}/orderItems`;
    if (nextToken) {
      endpoint += `?NextToken=${encodeURIComponent(nextToken)}`;
    }
    return this.request<{ OrderItems: any[]; NextToken?: string }>(endpoint);
  }
}
