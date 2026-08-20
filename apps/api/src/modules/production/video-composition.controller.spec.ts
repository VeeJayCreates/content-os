import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { VideoCompositionController } from './video-composition.controller';
import { VideoCompositionService } from './video-composition.service';

jest.mock('@content-os/contracts',()=>({AudioGenerationStatus:{READY:'ready'},ScenePlanStatus:{READY:'ready'},VideoCompositionAssetStrategy:{SELECTED_CANDIDATE:'selected_candidate',NO_ASSET:'no_asset'},VideoCompositionFailureCode:{},VideoCompositionPlanStatus:{READY:'ready'},VisualAssetManifestStatus:{READY:'ready'}}));
jest.mock('@content-os/storage',()=>({AudioGenerationRepository:class{},ContentScriptRepository:class{},ScenePlanRepository:class{},VideoCompositionRepository:class{},VisualAssetRepository:class{}}));
describe('VideoCompositionController HTTP',()=>{let app:INestApplication;const service={prepare:jest.fn(),find:jest.fn()};const id='11111111-1111-4111-8111-111111111111';beforeAll(async()=>{const module=await Test.createTestingModule({controllers:[VideoCompositionController],providers:[{provide:VideoCompositionService,useValue:service}]}).compile();app=module.createNestApplication();app.setGlobalPrefix('api');await app.init();});afterAll(()=>app.close());beforeEach(()=>jest.clearAllMocks());
 it('exposes prepare and read endpoints',async()=>{service.prepare.mockResolvedValue({id:'composition',status:'ready'});service.find.mockResolvedValue({id:'composition',status:'ready'});await request(app.getHttpServer()).post(`/api/content-scripts/${id}/video-composition-plan`).expect(201).expect(({body})=>expect(body.id).toBe('composition'));await request(app.getHttpServer()).get(`/api/content-scripts/${id}/video-composition-plan`).expect(200).expect(({body})=>expect(body.status).toBe('ready'));});
 it('rejects invalid script identities before service execution',async()=>{await request(app.getHttpServer()).post('/api/content-scripts/not-a-uuid/video-composition-plan').expect(400);expect(service.prepare).not.toHaveBeenCalled();});
});
