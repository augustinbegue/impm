interface ScriptOperation {
  code: string;
  description: string;
}

export class ResolveImportScript {
  private readonly scriptTemplate: string;
  private operations: ScriptOperation[];

  constructor() {
    this.operations = [];
    this.scriptTemplate = `#!/usr/bin/env python
import DaVinciResolveScript as dvr_script

def get_media_pool():
  """Initialize connection to Resolve and get media pool."""
  resolve = dvr_script.scriptapp("Resolve")
  project_manager = resolve.GetProjectManager()
  current_project = project_manager.GetCurrentProject()
  if not current_project:
      raise Exception("No project is currently open")
  return current_project.GetMediaPool()

def get_media_storage():
  """Get media storage."""
  resolve = dvr_script.scriptapp("Resolve")
  media_sorage = resolve.GetMediaStorage()
  if not media_sorage:
      raise Exception("No media storage found")
  return media_sorage

def main():
  try:
    media_pool = get_media_pool()
    root_folder = media_pool.GetRootFolder()
    {operations}
  except Exception as e:
    print(f"Error: {str(e)}")
    return False
  return True

if __name__ == "__main__":
  main()
`;
  }

  /**
   * Add files to the root folder (Master) in the Media Pool
   * @param filePaths Array of file paths to import
   * @throws Error if filePaths is empty
   */
  public addFilesToRoot(filePaths: string[]): void {
    if (!filePaths.length) {
      throw new Error("File paths array cannot be empty");
    }

    const pathsStr = filePaths.map(path => `"${path}"`).join(", ");
    const operation: ScriptOperation = {
      description: "Import files to root folder",
      code: `
    # Import files to root folder
    print("Importing files to root folder...")
    clips = media_pool.ImportMedia([${pathsStr}])
    if not clips:
      print("Failed to import some or all files to root folder")
        `
    };

    this.operations.push(operation);
  }

  /**
   * Create a subfolder and import files into it
   * @param folderName Name of the subfolder to create
   * @param filePaths Array of file paths to import into the subfolder
   * @throws Error if folderName is empty or filePaths is empty
   */
  public createSubfolderWithFiles(folderName: string, filePaths: string[]): void {
    if (!folderName.trim()) {
      throw new Error("Folder name cannot be empty");
    }
    if (!filePaths.length) {
      throw new Error("File paths array cannot be empty");
    }

    const pathsStr = filePaths.map(path => `"${path}"`).join(", ");
    const operation: ScriptOperation = {
      description: `Create subfolder '${folderName}' and import files`,
      code: `
    # Create subfolder and import files
    print("Checking if subfolder '${folderName}' exists...")
    existing_folders = root_folder.GetSubFolderList()
    if "${folderName}" in [folder.GetName() for folder in existing_folders]:
      new_folder = next(folder for folder in existing_folders if folder.GetName() == "${folderName}")
      print("Subfolder '${folderName}' already exists.")
    else:
      print("Creating subfolder '${folderName}'...")
      new_folder = media_pool.AddSubFolder(root_folder, "${folderName}")
      if not new_folder:
        raise Exception("Failed to create subfolder: ${folderName}")
    
    media_pool.SetCurrentFolder(new_folder)
    clips = media_pool.ImportMedia([${pathsStr}])
    if not clips:
      print("Failed to import some or all files to subfolder")
    media_pool.SetCurrentFolder(root_folder)  # Reset to root folder
      `
    };

    this.operations.push(operation);
  }

  /**
   * Generate the final Python script with all operations
   * @param outputPath Optional path to save the script to a file
   * @returns The generated script as a string if outputPath is not provided
   */
  public generateScript(outputPath?: string): string {
    const operationsStr = this.operations
      .map(op => op.code)
      .join("\n");

    const script = this.scriptTemplate.replace("{operations}", operationsStr);

    if (outputPath) {
      // In a browser environment, you might want to use the File System Access API
      // or provide alternative saving mechanisms
      const fs = require('fs');
      fs.writeFileSync(outputPath, script);
    }

    return script;
  }

  /**
   * Clear all operations from the script
   */
  public clearOperations(): void {
    this.operations = [];
  }

  /**
   * Get the number of operations in the script
   * @returns The number of operations
   */
  public getOperationCount(): number {
    return this.operations.length;
  }
}

// Example usage:
/*
const scriptGen = new ResolveImportScript();

// Add files to root folder
scriptGen.addFilesToRoot([
  "/path/to/clip1.mov",
  "/path/to/clip2.mov"
]);

// Create subfolder with files
scriptGen.createSubfolderWithFiles("Scene_01", [
  "/path/to/scene1_clip1.mov",
  "/path/to/scene1_clip2.mov"
]);

// Generate and save the script
const scriptContent = scriptGen.generateScript("import_media.py");
console.log(scriptContent);
*/
