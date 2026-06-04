export interface ShopifyClientConfig {
  shopName: string;
  accessToken: string;
}

export class ShopifyClient {
  private shopName: string;
  private accessToken: string;
  private apiVersion = "2024-04";

  constructor(config: ShopifyClientConfig) {
    // Clean shopName (ensure it has .myshopify.com and no protocol prefix)
    let cleanShop = config.shopName.trim().toLowerCase();
    cleanShop = cleanShop.replace(/^(https?:\/\/)?(www\.)?/, "");
    if (!cleanShop.includes(".myshopify.com") && !cleanShop.includes("localhost")) {
      cleanShop = `${cleanShop}.myshopify.com`;
    }
    this.shopName = cleanShop;
    this.accessToken = config.accessToken.trim();
  }

  private getBaseUrl(): string {
    return `https://${this.shopName}/admin/api/${this.apiVersion}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": this.accessToken,
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
