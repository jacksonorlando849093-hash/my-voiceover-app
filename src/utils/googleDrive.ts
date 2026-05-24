export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export interface ScriptProjectPayload {
  scriptText: string;
  voiceSettings: any;
  lineEmotions: any;
  lineSpeeds: any;
  linePauses: any;
  savedAt?: string;
}

/**
 * Lists JSON files stored in Google Drive that aren't in the trash.
 */
export async function listDriveFiles(accessToken: string): Promise<DriveFile[]> {
  const query = encodeURIComponent("mimeType = 'application/json' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list Google Drive files: ${response.statusText} (${errorText})`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Downloads a script file from Google Drive and parses its JSON content.
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string
): Promise<ScriptProjectPayload> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file from Google Drive: ${response.statusText}`);
  }

  const payload: ScriptProjectPayload = await response.json();
  return payload;
}

/**
 * Saves or updates a JSON script file in Google Drive using standard multipart upload.
 * If fileId is provided, it updates the existing file. Otherwise, it creates a new file.
 */
export async function saveDriveFile(
  accessToken: string,
  name: string,
  payload: ScriptProjectPayload,
  fileId?: string
): Promise<DriveFile> {
  const boundary = "VOICEOVER_STUDIO_BOUNDARY_LINE";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  // Always append .json if not present
  const fileName = name.endsWith(".json") ? name : `${name}.json`;

  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };

  const multipartBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(payload) +
    closeDelim;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const response = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save to Google Drive: ${response.statusText} (${errorText})`);
  }

  const data = await response.json();
  return {
    id: data.id,
    name: data.name || fileName,
    modifiedTime: new Date().toISOString(),
  };
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete Google Drive file: ${response.statusText} (${errorText})`);
  }
}
