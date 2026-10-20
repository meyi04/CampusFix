describe('CampusFix entry and responsive layouts', () => {
  it('routes unauthenticated visitors to sign in or Firebase setup', () => {
    cy.visit('/');
    cy.location('pathname').should('match', /^\/(auth\/login|setup)$/);

    cy.location('pathname').then((pathname) => {
      if (pathname === '/setup') {
        cy.contains('h1', 'Connect CampusFix to Firebase');
      } else {
        cy.contains('h2', 'Welcome back');
        cy.contains('Sign in with your university account.');
      }
    });
  });

  it('keeps public entry pages within a narrow mobile viewport', () => {
    cy.viewport(320, 740);
    cy.visit('/auth/login');
    cy.location('pathname').then((pathname) => {
      if (pathname === '/auth/login') {
        cy.contains('h2', 'Welcome back');
      } else {
        cy.contains('h1', 'Connect CampusFix to Firebase');
      }
    });

    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth);
    });

    cy.visit('/auth/register');
    cy.location('pathname').then((pathname) => {
      if (pathname === '/auth/register') {
        cy.contains('h1', 'Join the campus community');
      } else {
        cy.contains('h1', 'Connect CampusFix to Firebase');
      }
    });
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth);
    });
  });
});
