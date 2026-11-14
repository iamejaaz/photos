import type { AnyFlow } from "../flow";
import { timeline } from "./timeline";
import { viewer } from "./viewer";
import { editor } from "./editor";
import { upload } from "./upload";
import { search } from "./search";
import { settings } from "./settings";
import { albums } from "./albums";
import { sharing } from "./sharing";
import { trash } from "./trash";
import { library } from "./library";
import { people } from "./people";
import { explore } from "./explore";

export const flows: AnyFlow[] = [timeline, viewer, editor, upload, search, settings, albums, sharing, trash, library, people, explore];
