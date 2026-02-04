declare global {
    interface Window {
        electronAPI: {
            openFileDialog: () => Promise<{
                canceled: boolean;
                filePaths?: string[];
            }>;
            saveFileDialog: (data: {
                content: string;
                defaultPath?: string;
            }) => Promise<{
                canceled: boolean;
                filePath?: string;
            }>;
            getAppVersion: () => Promise<string>;
            isElectron: boolean;
        };
    }
}
export {};
