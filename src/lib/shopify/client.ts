export interface ShopifyClientConfig {
  shopName: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export class ShopifyClient {
  private shopName: string;
  private accessToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private apiVersion = "2024-04";

  constructor(config: ShopifyClientConfig) {
    // Clean shopName (ensure it has .myshopify.com and no protocol prefix)
    let cleanShop = config.shopName.trim().toLowerCase();
    cleanShop = cleanShop.replace(/^(https?:\/\/)?(www\.)?/, "");
    if (!cleanShop.includes(".myshopify.com") && !cleanShop.includes("localhost")) {
      cleanShop = `${cleanShop}.myshopify.com`;
    }
    this.shopName = cleanShop;
    this.accessToken = config.accessToken?.trim();
    this.clientId = config.clientId?.trim();
    this.clientSecret = config.clientSecret?.trim();
  }

  private getBaseUrl(): string {
    return `https://${this.shopName}/admin/api/${this.apiVersion}`;
  }

  private async getOrFetchAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Shopify Client configuration is missing access token or API credentials.");
    }

    const url = `https://${this.shopName}/admin/oauth/access_token`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange Shopify credentials for access token: ${errorText}`);
    }

    const data = (await response.json()) as any;
    if (!data.access_token) {
      throw new Error("Shopify did not return an access token in the credentials grant response.");
    }

    this.accessToken = data.access_token;
    return this.accessToken!;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const token = await this.getOrFetchAccessToken();
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API Error (${response.status}): ${errorText || response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // --- Locations ---
  async getLocations(): Promise<{ locations: any[] }> {
    return this.request<{ locations: any[] }>("/locations.json");
  }

  // --- Products ---
  async getProducts(limit = 50, sinceId?: string): Promise<{ products: any[] }> {
    let endpoint = `/products.json?limit=${limit}`;
    if (sinceId) {
      endpoint += `&since_id=${sinceId}`;
    }
    return this.request<{ products: any[] }>(endpoint);
  }

  async getProduct(productId: string): Promise<{ product: any }> {
    return this.request<{ product: any }>(`/products/${productId}.json`);
  }

  // --- Inventory ---
  async updateInventoryLevel(params: {
    inventory_item_id: number;
    location_id: number;
    available: number;
  }): Promise<{ inventory_level: any }> {
    return this.request<{ inventory_level: any }>("/inventory_levels/set.json", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // --- Webhooks ---
  async getWebhooks(): Promise<{ webhooks: any[] }> {
    return this.request<{ webhooks: any[] }>("/webhooks.json");
  }

  async createWebhook(topic: string, address: string): Promise<{ webhook: any }> {
    return this.request<{ webhook: any }>("/webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format: "json",
        },
      }),
    });
  }

  async deleteWebhook(webhookId: string | number): Promise<void> {
    await this.request<void>(`/webhooks/${webhookId}.json`, {
      method: "DELETE",
    });
  }
}
