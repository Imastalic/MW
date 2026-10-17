import fs from "fs/promises";

export async function Rewrite(key, path) {
  switch (key) {
    case "space":
      await fs.appendFile(path, " ", "utf8");
      break;

    case "backspace": {
      let text = await fs.readFile(path, "utf8");

      if (text.length >= 1) {
        text = text.slice(0, -1);
        await fs.writeFile(path, text, "utf8");
      }

      break;
    }

    case "enter":
      await fs.appendFile(path, "\n", "utf8");
      break;

    default:
      if (key.length === 1) {
        await fs.appendFile(path, key, "utf8");
      }
      break;
  }
}

export async function JsonFormatTxtParser(obj) {
  await fs.appendFile(obj);
}
