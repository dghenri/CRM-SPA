import { Button, useTheme, Tabs } from "@heroui/react";

import { 
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

export default function ThemeSwitcher() {
  const {resolvedTheme, setTheme, theme} = useTheme("system");
  const s = "w-8 p-2";

  return (
    <div className="flex items-center">
      <Tabs
        selectedKey={theme ?? "system"}
        onSelectionChange={(key) => setTheme(key)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Options" className="">
            <Tabs.Tab id="light" className={s}>
              <Sun className="size-5" />
              <Tabs.Indicator className={s} />
            </Tabs.Tab>
            <Tabs.Tab id="dark" className={s}>
              <Moon className="size-5" />
              <Tabs.Indicator className={s} />
            </Tabs.Tab>
            <Tabs.Tab id="system" className={s}>
              <Monitor className="size-5" />
              <Tabs.Indicator className={s} />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel/>
      </Tabs>
    </div>
  );
}