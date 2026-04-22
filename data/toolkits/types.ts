export type ToolkitAction = {
  label: string;
  href: string;
  note?: string;
};

export type ToolkitSection =
  | {
      type: "checklist";
      title: string;
      items: string[];
      id?: string; // optional stable id; if omitted we'll derive from title
    }
  | {
      type: "bullets";
      title: string;
      items: string[];
    }
  | {
      type: "text";
      title: string;
      text: string;
    }
  | {
      type: "actions";
      title: string;
      actions: ToolkitAction[];
    };

export type Toolkit = {
  slug: string;
  title: string;
  subtitle: string;
  sections: ToolkitSection[];
};