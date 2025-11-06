import { exec } from "child_process";

exec("npx puppeteer browsers install chrome", (error, stdout, stderr) => {
  if (error) {
    console.error("❌ Erreur lors de l'installation de Chrome :", error);
    return;
  }
  console.log("✅ Chrome installé avec succès !");
  console.log(stdout);
  if (stderr) console.error(stderr);
});
