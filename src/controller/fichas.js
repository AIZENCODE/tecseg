import puppeteer from "puppeteer";
import { join, dirname } from "path";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import userPrefs from "puppeteer-extra-plugin-user-preferences";
import puppeteerExtra from "puppeteer-extra";
import fetch from "node-fetch";

export async function fichas() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const productsInformation = [];
  const currentFileURL = import.meta.url;
  const currentFilePath = fileURLToPath(currentFileURL);
  const currentDirPath = dirname(currentFilePath);
  const __dirname = join(currentDirPath, "..", "public");
  const imagesDir = join(__dirname, "downloaded_images");
  const pdfsDir = join(__dirname, "downloaded_pdfs");

  try {
    await page.goto("https://tiendaonline.soltrak.com.pe/tecseg", {
      waitUntil: "domcontentloaded",
    });
    await page.setViewport({ width: 1920, height: 1080 }); // Establecer el tamaño de la ventana
    await page.waitForSelector(".products");
    await page.waitForTimeout(3000);
    const allProductLinks = [];
    let hasNextPage = true;

    while (hasNextPage) {
      const enlaces = await page.evaluate(() => {
        const links = new Set(); // Utilizar un conjunto para almacenar los enlaces únicos
        const elements = document.querySelectorAll(
          ".products.list .product-item strong a"
        );

        for (let element of elements) {
          const href = element.href;
          if (!links.has(href)) {
            // Verificar si el enlace ya existe en el conjunto
            links.add(href); // Agregar el enlace al conjunto si no existe
          }
        }

        return Array.from(links); // Convertir el conjunto a un array antes de devolverlo
      });

      allProductLinks.push(...enlaces);

      const nextPageButton = await page.$(".next");
      const isClassPresent = await page.evaluate(() => {
        const anchorElement = document.querySelector("li a.next");
        return anchorElement ? true : false;
      });
      console.log(isClassPresent);

      if (isClassPresent) {
        await nextPageButton.click();
        await page.waitForSelector(".products");
        await page.setViewport({ width: 1920, height: 1080 }); // Establecer el tamaño de la ventana
        await page.waitForTimeout(3000);
      } else {
        console.log("isClassPresent is an empty object.");
        hasNextPage = false;
      }
    }

    console.log(allProductLinks);
    // Obtener información detallada de cada producto
    let count = 1;
    for (let link of allProductLinks) {
      await page.goto(link, { waitUntil: "networkidle2" });
      await page.waitForSelector(".page-title");
      //  await page.waitForSelector('.woocommerceflex-active-slide');
      const productInfo = await page.evaluate(() => {
        const tmp = {};

        // const skuElement = document.querySelector(".sku");
        // if (skuElement) {
        //   const skuText = skuElement.innerText.trim();
        //   tmp.SKU =
        //     skuText !== "" && skuText !== "N/D"
        //       ? skuText
        //       : "CAM" + Date.now().toString(); // Si el SKU no está vacío ni es "N/D", se mantiene; de lo contrario, se genera uno nuevo
        // } else {
        //   tmp.SKU = "CAM" + Date.now().toString(); // En caso de que no se encuentre el elemento SKU, generar un SKU único con la inicial "CAM" y la marca de tiempo actual
        // }
        const nombre = document.querySelector("h1.page-title span").innerText.trim();
        tmp.nombre = nombre;
        const productDescriptionElement = document.querySelector(
          ".product.attribute.description"
        );
        if (productDescriptionElement) {
          tmp.description = productDescriptionElement
            ? productDescriptionElement.innerHTML
            : "";
        }
        //   tallas
        const producttallas = document.querySelectorAll(
          ".talla_zapatos .swatch-attribute-options .swatch-option"
        );
        if (producttallas.length > 0) {
          const tallasArray = [];
          producttallas.forEach((item) => {
            tallasArray.push(item.innerHTML);
          });
          tmp.tallas = tallasArray.join(", "); // Puedes unir los elementos en una cadena, si es necesario
        } else {
          tmp.tallas = "";
        }
        // Fin tallas



        tmp.pageURL = window.location.href;

        // Obtener el nombre del producto sin espacios y con guiones

        tmp.imageenlace =
          "https://theme.mercadoindustrial.pe/wp-content/uploads/2023/12/" +
          nombre.replace(/\s+/g, "-") +
          ".webp";

        const productImageElement = document.querySelector(
          ".main-product-image-wrapper-inner picture .zoomWrapper img"
        );
        tmp.image = productImageElement
          ? productImageElement.getAttribute("src")
          : null;

        const pdfElement = document.querySelector(
          ".download-attachment a"
        );
        tmp.pdf = pdfElement ? pdfElement.getAttribute("href") : null;
        return tmp;
      });

      console.log(productInfo.image);
      console.log(productInfo.pdf);
      console.log(productInfo.tallas);
      console.log(productInfo.colores);
      console.log(productInfo.modelos);
      console.log(productInfo.categoria);
      puppeteerExtra.use(
        userPrefs({
          preferences: {
            download: {
              prompt_for_download: true,
              open_pdf_in_system_reader: true,
            },
            plugins: {
              always_open_pdf_externally: true,
            },
          },
        })
      );

      //   pdf
        if (productInfo.pdf) {
          try {
            const response = await fetch(productInfo.pdf);
            const pdfBuffer = await response.buffer();
            const invalidCharsRegex = /[/\\?%*:|"<>]/g; // Expresión regular para los caracteres inválidos en nombres de archivo
            const textoSinEspacios = `${productInfo.nombre
             .replace(/[/\\?%*:|"<>]/g, "")
             .replace(/\s+/g, "-")}`;
            const pdfFileName = `${textoSinEspacios}.pdf`;
            const pdfPath = join(pdfsDir, pdfFileName);
            writeFileSync(pdfPath, pdfBuffer);
            console.log(`PDF descargado y guardado en: ${pdfPath}`);
          } catch (error) {
            console.error("Error al descargar el PDF:", error);
          }
        }

      //   fin pdf

      //   img

       if (productInfo.image) {
         // Descargar y guardar la imagen del producto (sin procesar)
         const imageLink = productInfo.image;
         const response = await page.goto(imageLink, {
           waitUntil: "networkidle2",
         });
         const buffer = await response.buffer();
         const imageName = `${productInfo.nombre
           .replace(/[/\\?%*:|"<>]/g, "")
           .replace(/\s+/g, "-") // Reemplazar espacios en blanco con guiones (-)
           .substring(0, 100)}.jpg`;
         const imagePath = join(`${imagesDir}`, imageName);
         writeFileSync(imagePath, buffer);
       }

      // Fin img

      const newProductInfo = { ...productInfo }; // Crear una copia independiente del objeto
      newProductInfo.id = count;
      productsInformation.push(newProductInfo); // Agregar la copia al array

      count++;
    }
  } catch (error) {
    console.error("Error durante el scraping:", error);
  } finally {
    await browser.close();
  }

  try {
    const jsonFilePath = join(__dirname, "products_information.json");
    const jsonString = JSON.stringify(productsInformation, null, 2);
    writeFileSync(jsonFilePath, jsonString);
    console.log("Información recopilada guardada en products_information.json");
  } catch (error) {
    console.error("Error al guardar la información recopilada en JSON:", error);
  }
}
