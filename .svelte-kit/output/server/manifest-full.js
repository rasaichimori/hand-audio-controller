export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.png"]),
	mimeTypes: {".png":"image/png"},
	_: {
		client: {start:"_app/immutable/entry/start.7PdYoaeQ.js",app:"_app/immutable/entry/app.C6trwRVs.js",imports:["_app/immutable/entry/start.7PdYoaeQ.js","_app/immutable/chunks/BGawRCqn.js","_app/immutable/chunks/CwB22T1K.js","_app/immutable/chunks/DSJNskzs.js","_app/immutable/entry/app.C6trwRVs.js","_app/immutable/chunks/CwB22T1K.js","_app/immutable/chunks/BXhUi9Ub.js","_app/immutable/chunks/dzMLb0AB.js","_app/immutable/chunks/DSJNskzs.js","_app/immutable/chunks/BrUdyrF8.js","_app/immutable/chunks/BhtwuzuQ.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
