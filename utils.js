module.exports = {
  toParam: (s) => {
    const strArr = s.replace(/_/gi, ' ').split(' ');
    strArr.forEach((p, i) => {
      strArr[i] = p.charAt(0).toUpperCase() + p.substr(1).toLowerCase();
    });

    return strArr.join('');
  },
  sanitizeName: (s) => {
    const regexp = /@[A-Za-z-]*\//gi;
    return s.replace(regexp, '');
  }
};
