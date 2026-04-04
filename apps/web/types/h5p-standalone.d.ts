declare module 'h5p-standalone' {
    export interface H5POptions {
        h5pJsonPath: string;
        frameJs?: string;
        frameCss?: string;
        contentJsonPath?: string;
        librariesPath?: string;
        fullScreen?: boolean;
        embed?: boolean;
        id?: string;
    }

    export class H5P {
        constructor(container: HTMLElement, options: H5POptions | string);
    }
}
