import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentRedactor } from './document-redactor';

describe('DocumentRedactor', () => {
  let component: DocumentRedactor;
  let fixture: ComponentFixture<DocumentRedactor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentRedactor],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentRedactor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
