type DynamicRoutes = {
	
};

type Layouts = {
	"/": undefined;
	"/api": undefined;
	"/api/chat": undefined;
	"/api/entities": undefined;
	"/api/health": undefined;
	"/api/test": undefined;
	"/api/webhook-log": undefined;
	"/api/zoho-webhook": undefined;
	"/dashboard": undefined;
	"/webhooks": undefined
};

export type RouteId = "/" | "/api" | "/api/chat" | "/api/entities" | "/api/health" | "/api/test" | "/api/webhook-log" | "/api/zoho-webhook" | "/dashboard" | "/webhooks";

export type RouteParams<T extends RouteId> = T extends keyof DynamicRoutes ? DynamicRoutes[T] : Record<string, never>;

export type LayoutParams<T extends RouteId> = Layouts[T] | Record<string, never>;

export type Pathname = "/" | "/api" | "/api/chat" | "/api/entities" | "/api/health" | "/api/test" | "/api/webhook-log" | "/api/zoho-webhook" | "/dashboard" | "/webhooks";

export type ResolvedPathname = `${"" | `/${string}`}${Pathname}`;

export type Asset = never;