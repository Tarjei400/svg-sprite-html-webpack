const { createSprite } = require('./spriteUtils');

const BODY_TAG_BEGIN = '<body';
const BODY_TAG_END = '>';

/* eslint-disable no-param-reassign */
module.exports = class SvgSpriteHtmlWebpackPlugin {
  /**
   * @constructor
   * @param {object} options - plugin options
   * @param {function(string, number, string):string} options.generateSymbolId function which compute id of each symbol.
   *        arg0 is the svgFilePath.
   *        arg1 is the svgHash.
   *        arg2 is the svgContent.
   */
  constructor(options = {}) {
    this.nextSymbolId = 0; // use only by this.generateId
    this.generateSymbolId = options.generateSymbolId || this.generateSymbolId.bind(this);
    this.svgList = [];
    this.lastCompiledList = this.svgList;
    this.svgSprite = '';

    this.pushSvg = this.pushSvg.bind(this);
    this.processSvg = this.processSvg.bind(this);
  }

  /**
   * Generate symbol id of a svg in the sprite
   * this function is not use if options.generateSymbolId is set in constructor
   * @return {string} the id of generated symbol
   */
  generateSymbolId() {
    const id = this.nextSymbolId.toString();
    this.nextSymbolId += 1;
    return id;
  }

  /**
   * Check if a svg file is already in a list of imported svg
   * @param {object} svgItem - svg to push in list of svg to compile
   * @param {string} svgItem.id
   * @param {number} svgItem.hash
   * @param {string} svgItem.path
   * @param {string} svgItem.content
   * @return {boolean} true if svgItem is already in the list
   */
  isAlreadyInList(svgItem) {
    const svgItemIndex = this.svgList.findIndex(item => item.hash === svgItem.hash);
    return svgItemIndex >= 0;
  }

  /**
   * Add a svg to compile in this.svgList
   * we use spread syntax instead of array.prototype.push to check easier if the svgList change
   * @param {object} svgItem - svg to push in list of svg to compile
   * @param {string} svgItem.id
   * @param {number} svgItem.hash
   * @param {string} svgItem.path
   * @param {string} svgItem.content
   */
  pushSvg(svgItem) {
    if (!this.isAlreadyInList(svgItem)) {
      // avoid to have 2 svg in the list for the same path
      const listWithoutPreviousItemVersion = this.svgList
        .filter(item => item.path !== svgItem.path);
      this.svgList = [...listWithoutPreviousItemVersion, svgItem];
    }
  }

  /**
   * Function called by webpack during compilation
   * @param {object} compiler - webpack compiler
   */
  apply(compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('normal-module-loader', (loaderContext) => {
        // Give loader access to the list of svg to compile
        // Svg loader will push imported svg paths and ids
        if (!loaderContext.svgList || !loaderContext.generateSymbolId) {
          loaderContext.pushSvg = this.pushSvg;
          loaderContext.generateSymbolId = this.generateSymbolId;
        }
      });

      if (compilation.hooks) {
        if (compilation.hooks.htmlWebpackPluginBeforeHtmlProcessing) {
          compilation.hooks.htmlWebpackPluginBeforeHtmlProcessing.tapAsync('svg-sprite-html-webpack', this.processSvg);
        } else {
          console.warn('WARNING : `compilation.hooks.htmlWebpackPluginBeforeHtmlProcessing` is undefined');
          console.info('SvgSpriteHtmlWebpackPlugin must be declare after HtmlWebpackPlugin to works');
        }
      } else {
        compilation.plugin('html-webpack-plugin-before-html-processing', this.processSvg);
      }
    });
  }

  /**
   * Inject svg sprite in the body of HTML string
   * @param {string} html - HTML string generated by HtmlWebpackPlugin
   * @return {string} html with svg sprite
   */
  insertSpriteInHtml(html) {
    const bodyOpenTagStart = html.indexOf(BODY_TAG_BEGIN);
    const hasBodyTag = bodyOpenTagStart >= 0;
    if (!hasBodyTag) return html;

    const bodyOpenTagEnd = html.indexOf(BODY_TAG_END, bodyOpenTagStart) + 1;
    const beforeBodyContent = html.slice(0, bodyOpenTagEnd);
    const bodyContentAndEnd = html.slice(bodyOpenTagEnd);
    const htmlWithSvg = beforeBodyContent + this.svgSprite + bodyContentAndEnd;
    return htmlWithSvg;
  }

  /**
   * Function called when HTML string is generated by HtmlWebpackPlugin
   * This function generate svg sprite with the list of svg collected by the svgLoader (./loader.js)
   * When the sprite is generated, it's injected in the HTML string
   * @param {object} htmlPluginData - object created by HtmlWebpackPlugin
   * @param {function} callback function to call when sprite creation and injection is finished
   */
  processSvg(htmlPluginData, callback) {
    const svgListChanged = this.svgList !== this.lastCompiledList;

    if (svgListChanged) {
      createSprite(this.svgList)
        .then((svgSprite) => {
          this.lastCompiledList = this.svgList;
          this.svgSprite = svgSprite;

          htmlPluginData.html = this.insertSpriteInHtml(htmlPluginData.html);
          callback(null, htmlPluginData);
        })
        .catch(console.error);
    } else {
      htmlPluginData.html = this.insertSpriteInHtml(htmlPluginData.html);
      callback(null, htmlPluginData);
    }
  }

  /**
   * Resolve the path of webpack loader to add in webpack configuration
   * @return {string} - the path of the svg loader
   */
  static getLoader() {
    return require.resolve('./loader.js');
  }
};
