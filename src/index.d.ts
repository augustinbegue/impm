export interface ProjectDefinition {
  name: string;
  subAlbums?: {
    suffix: string;
    path: string;
  }[];
}
