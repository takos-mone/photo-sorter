/** File System Access API の型補完（TS標準libに無い部分） */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission(desc?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(desc?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }): Promise<FileSystemDirectoryHandle>;
}

interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null>;
}
