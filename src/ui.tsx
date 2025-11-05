import React, { useState } from "react";
import { Box, Text, Newline } from "ink";
import SelectInput from "ink-select-input";

type Option = "news" | "support" | "about" | null;

export default function App() {
  const [selectedOption, setSelectedOption] = useState<Option>(null);

  const handleSelect = (item: any) => {
    if (item.value === "exit") {
      process.exit(0);
    }
    setSelectedOption(item.value);
  };

  const items = [
    {
      label: "社团动态 (Organization News)",
      value: "news",
    },
    {
      label: "技术支持 (Technical Support)",
      value: "support",
    },
    {
      label: "关于我们 (About Us)",
      value: "about",
    },
    {
      label: "退出 (Exit)",
      value: "exit",
    },
  ];

  const renderContent = () => {
    switch (selectedOption) {
      case "news":
        return <Text>这里是最新的社团动态。</Text>;
      case "support":
        return <Text>这里是技术支持信息。</Text>;
      case "about":
        return (
          <Text>
            NBTCA（宁波理工学院计算机协会）是一个致力于计算机技术学习与交流的学生社团。
          </Text>
        );
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column">
      <Text>欢迎来到NBTCA</Text>
      <Newline />
      <SelectInput items={items} onSelect={handleSelect} />
      <Newline />
      {selectedOption && <Box>{renderContent()}</Box>}
    </Box>
  );
}
