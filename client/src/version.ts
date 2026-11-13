declare const __DELYWA_VERSION__: string | undefined;

/** Versión publicada (viene de package.json al compilar). */
export const VERSION_APP: string = typeof __DELYWA_VERSION__ === "string" ? __DELYWA_VERSION__ : "dev";
