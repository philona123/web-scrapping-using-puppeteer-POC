const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const { log } = require("console");




function formatData(inputJson) {
  const keys = [
    "Extrusion(E)/Intrusion(I)",
    "Translation Buccal(B)/Lingual(L)",
    "Translation Mesial(M)/Distal(D)",
    "Rotation Mesial(M)/Distal(D)",
    "Angulation Mesial(M)/Distal(D)",
    "Torque Buccal(B)/Lingual(L)",
  ];

  const finalObj = {};
  const headValue = inputJson["moveInfo-thead"];
  const rowValues = inputJson["moveInfo-tr"];
  for (let i = 0; i < keys.length; i++) {
    const arr = rowValues.slice(14 * i, 14 * i + 14);
    const positionObj = {};
    for (let j = 0; j < arr.length; j++) {
      if (arr[j] != "0" && arr[j] != '') {
        positionObj[headValue[j]] = arr[j];
      }
    }
    finalObj[keys[i]] = positionObj;
  }
  return finalObj;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });
  const page = await browser.newPage();
  const scrappedDataList = [];
  let allLinksScrapped = true;

  const scrapeDataFromHtml = (htmlContent) => {
    const $ = cheerio.load(htmlContent);
    const scrappedDataTitle = { "moveInfo-thead": [], "moveInfo-tr": [] };
    const scrappedDataValue = { "moveInfo-thead": [], "moveInfo-tr": [] };

    $("#moveTable .moveInfo-title p").each((index, element) => {
      const className = $(element).attr("class");
      if (className) {
        scrappedDataTitle[className] = scrappedDataTitle[className] || [];
        scrappedDataTitle[className].push($(element).text().trim());
      }
    });

    $("#moveTable .moveInfo-value div .moveInfo-thead div").each(
      (index, element) => {
        console.log("ele: ", $(element).text().trim());
        scrappedDataTitle["moveInfo-thead"].push($(element).text().trim());
      }
    );

    $("#moveTable .moveInfo-value div .moveInfo-tr div").each(
      (index, element) => {
        console.log("ele: ", $(element).text().trim());
        scrappedDataTitle["moveInfo-tr"].push($(element).text().trim());
      }
    );

    $("#moveTable .moveInfo-btn p").each((index, element) => {
      const className = $(element).attr("class");
      if (className) {
        scrappedDataValue[className] = scrappedDataValue[className] || [];
        scrappedDataValue[className].push($(element).text().trim());
      }
    });

    for (const dataType in scrappedDataTitle) {
      console.log(`Title ${dataType} Data:`, scrappedDataTitle[dataType]);
    }

    for (const dataType in scrappedDataValue) {
      console.log(`Value ${dataType} Data:`, scrappedDataValue[dataType]);
    }

    return { scrappedDataTitle, scrappedDataValue };
  };

  const scrapeDataFromLink = async (baseUrl) => {
    const fullUrl = `${baseUrl}`;
    console.log(`Navigating to URL: ${baseUrl}`);
    await page.goto(fullUrl);
    await page.waitForNavigation({ waitUntil: "networkidle0" });

    try {
      await page.waitForSelector("#plyMoveSwitch:not([disabled])", { timeout: 20000 }); //show movement table switcvcj
      const moveSwitch = await page.$("#plyMoveSwitch:not([disabled])");
      console.log(moveSwitch.outerHTML);
      await moveSwitch.click({timeout: 20000});
      console.log("Clickedd");

      await page.waitForSelector("#dragStep:not([disabled])", { //drag to last
        timeout: 20000,
      });
    const elementHandle = await page.waitForXPath('//*[@id="dragStep"]', {
      visible: true,
    });

    const boundingBox = await elementHandle.boundingBox();
    const x = boundingBox.x + boundingBox.width / 2;
    const y = boundingBox.y + boundingBox.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 840, y, { steps: 70 });
    await page.mouse.up();

    await page.waitForSelector( //clicking the total button
      "#moveTable>div:nth-child(3)>p:nth-child(4):not([disabled])",
      { timeout: 20000 }
    );
    const totalSwitch = await page.$(
      "#moveTable>div:nth-child(3)>p:nth-child(4):not([disabled])"
    );
    await totalSwitch.click({ timeout: 20000 });
      page.click(
        "#moveTable > div:nth-child(3) > p:nth-child(4):not([disabled])"
      );
      const tableHtml = await page.$eval(
        "#moveTable:not([disabled])",
        (table) => table.outerHTML
      );
      const scrappedData = scrapeDataFromHtml(tableHtml);
      await page.waitForSelector("#moveInfoChangeJaw:not([disabled])")
      const jawSwitch = await page.$("#moveInfoChangeJaw:not([disabled])"); // jaw change switch
      await jawSwitch.click({timeout:2000});
      const tableHtml2 = await page.$eval(
        "#moveTable:not([disabled])",
        (table) => table.outerHTML
      );
      const scrappedDataLower = scrapeDataFromHtml(tableHtml2);
      scrappedDataList.push({
        "Smartee Link": fullUrl,
        DataUpper: scrappedData,
        DataLower: scrappedDataLower,
      });
      console.log(`Successfully scrapped data from: ${fullUrl}`);
      fs.writeFileSync(
        "scrapped_data.csv",
        JSON.stringify(scrappedDataList, null, 2)
      );
    } catch (error) {
      console.error(`Error while scraping data from Smartee Link: ${fullUrl}`);
      console.error(error);
      allLinksScrapped = false;
    } finally {
      await page.close();
    }
  };

  const csvFilePath = "tpvs.csv";
  const csvContent = fs.readFileSync(csvFilePath, "utf8").split("\n");

const base_url = csvContent[0];
await scrapeDataFromLink(base_url);

  if (allLinksScrapped) {
    console.log("All scrapped data saved to scrapped_data.csv");
    const output = {
      DataUpper: formatData(scrappedDataList[0].DataUpper.scrappedDataTitle),
      DataLower: formatData(scrappedDataList[0].DataLower.scrappedDataTitle),
    };
    fs.writeFileSync(
      "scrapped_data.csv",
      JSON.stringify(output, null, 2)
    );
  } else {
    console.log("Not all links were successfully scrapped. Data not saved.");
  }

  await browser.close();
})();
