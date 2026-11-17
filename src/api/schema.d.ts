export interface paths {
    "/api/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listProducts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/products/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getProduct"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/products/{slug}/recommendations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listRecommendations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/purchase-check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["checkPurchase"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ProductCoverImage: {
            path: string;
            alt: string;
        };
        ProductCategory: {
            slug: string;
            name: string;
        };
        CategoryListItem: {
            slug: string;
            name: string;
        };
        CategoriesResponse: {
            items: components["schemas"]["CategoryListItem"][];
        };
        ProductListItem: {
            slug: string;
            name: string;
            brand: string;
            model: string;
            category: components["schemas"]["ProductCategory"];
            displayPriceCents: number;
            displayOriginalPriceCents: number;
            soldOut: boolean;
            rating: number;
            sales: number;
            coverImage: components["schemas"]["ProductCoverImage"];
        };
        ProductListResponse: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
            items: components["schemas"]["ProductListItem"][];
        };
        ProductRecommendationsResponse: {
            items: components["schemas"]["ProductListItem"][];
        };
        ProductDimension: {
            name: string;
            options: string[];
        };
        ProductVariant: {
            sku: string;
            option1Value: string;
            option2Value: string;
            priceCents: number;
            originalPriceCents: number;
            stock: number;
        };
        ProductDetailBlock: {
            /** @constant */
            type: "text";
            text: string;
        } | {
            /** @constant */
            type: "image";
            path: string;
            alt: string;
        };
        ProductDetailResponse: {
            slug: string;
            name: string;
            brand: string;
            model: string;
            category: components["schemas"]["ProductCategory"];
            displayPriceCents: number;
            displayOriginalPriceCents: number;
            soldOut: boolean;
            rating: number;
            sales: number;
            coverImage: components["schemas"]["ProductCoverImage"];
            stock: number;
            images: components["schemas"]["ProductCoverImage"][];
            dimensions: components["schemas"]["ProductDimension"][];
            variants: components["schemas"]["ProductVariant"][];
            detail: components["schemas"]["ProductDetailBlock"][];
        };
        PurchaseCheckProduct: {
            slug: string;
            name: string;
        };
        PurchaseCheckVariant: {
            sku: string;
            option1Value: string;
            option2Value: string;
        };
        PurchaseCheckResponse: {
            /** @constant */
            result: "purchasable";
            product: components["schemas"]["PurchaseCheckProduct"];
            variant: components["schemas"]["PurchaseCheckVariant"];
            quantity: number;
            unitPriceCents: number;
            subtotalCents: number;
            stock: number;
            /** @constant */
            priceChanged: false;
        } | {
            /** @constant */
            result: "blocked";
            /** @constant */
            reason: "INSUFFICIENT_STOCK";
            product: components["schemas"]["PurchaseCheckProduct"];
            variant: components["schemas"]["PurchaseCheckVariant"];
            quantity: number;
            unitPriceCents: number;
            subtotalCents: number;
            stock: number;
            priceChanged: boolean;
        } | {
            /** @constant */
            result: "blocked";
            /** @constant */
            reason: "PRICE_CHANGED";
            product: components["schemas"]["PurchaseCheckProduct"];
            variant: components["schemas"]["PurchaseCheckVariant"];
            quantity: number;
            unitPriceCents: number;
            subtotalCents: number;
            stock: number;
            /** @constant */
            priceChanged: true;
            requestedUnitPriceCents: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listProducts: {
        parameters: {
            query?: {
                category?: string;
                priceMinCents?: number;
                priceMaxCents?: number;
                minSales?: number;
                keyword?: string;
                sort?: "price_asc" | "price_desc" | "sales_desc";
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductListResponse"];
                };
            };
        };
    };
    getProduct: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductDetailResponse"];
                };
            };
        };
    };
    listRecommendations: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductRecommendationsResponse"];
                };
            };
        };
    };
    listCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoriesResponse"];
                };
            };
        };
    };
    checkPurchase: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    slug: string;
                    sku: string;
                    quantity: number;
                    expectedUnitPriceCents?: number;
                };
            };
        };
        responses: {
            /** @description Default Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchaseCheckResponse"];
                };
            };
        };
    };
}
