
// This file has been simplified to remove backup functionality
// All backup, import, and export features have been removed

export const createBackup = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Backup functionality has been removed' };
};

export const importBackup = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Import functionality has been removed' };
};

export const pickBackupFile = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'File picker functionality has been removed' };
};

export const shareBackupFile = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Share functionality has been removed' };
};

export const getBackupInfo = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Backup info functionality has been removed' };
};

export const cleanupOldBackups = async (): Promise<{ success: boolean; error?: string }> => {
  return { success: false, error: 'Cleanup functionality has been removed' };
};
