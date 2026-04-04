
declare module 'react-google-drive-picker' {
    export interface PickerConfig {
        clientId: string;
        developerKey: string;
        viewId?: string;
        token?: string;
        showUploadView?: boolean;
        showUploadFolders?: boolean;
        supportDrives?: boolean;
        multiselect?: boolean;
        customViews?: any[];
        locale?: string;
        setIncludeFolders?: boolean;
        setSelectFolderEnabled?: boolean;
        callbackFunction: (data: any) => void;
    }

    export default function useDrivePicker(): [(config: PickerConfig) => void];
}
